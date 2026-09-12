import { useEffect, useRef, useState } from 'react'
import './App.css'
import { detectLight } from './signalDetector'
import { createSignalHold } from './signalHold'

type Signal = 'unknown' | 'green' | 'red'
type Phase = 'assembly' | 'return' | 'home'
type FinalMoment = 'hold' | 'fade'
const assemblyAssets = ['/characters/1.PNG', '/characters/2.PNG', '/characters/3.PNG']
const reactionAsset = '/characters/4.PNG'

function App() {
  const [signal, setSignal] = useState<Signal>('unknown')
  const [phase, setPhase] = useState<Phase>('assembly')
  const [assemblyStep, setAssemblyStep] = useState(1)
  const [finished, setFinished] = useState(0)
  const [walkerProgress, setWalkerProgress] = useState(0)
  const [walkerTurned, setWalkerTurned] = useState(false)
  const [finalMoment, setFinalMoment] = useState<FinalMoment>('hold')
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [detectedSignal, setDetectedSignal] = useState<Signal | null>(null)
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null)
  const [characterMask, setCharacterMask] = useState('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (phase !== 'assembly' || assemblyStep !== 3) return
    const timer = window.setTimeout(() => {
      setPhase('return')
      setWalkerProgress(0)
      setWalkerTurned(false)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [assemblyStep, phase])

  useEffect(() => {
    if (phase !== 'return' || signal !== 'green' || walkerProgress < 1 || Math.floor(walkerProgress) % 12 !== 0) return
    const context = audioContextRef.current ?? new AudioContext()
    audioContextRef.current = context
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = walkerTurned ? 145 : 190
    oscillator.type = 'triangle'
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.1)
  }, [phase, signal, walkerProgress, walkerTurned])

  useEffect(() => {
    if (phase === 'return' && signal === 'green') {
      const timer = window.setInterval(() => {
        setWalkerProgress((progress) => {
          const nextProgress = Math.min(progress + 1.8, 100)
          if (!walkerTurned && nextProgress >= 55) {
            setWalkerTurned(true)
          }
          if (nextProgress >= 100) {
            setFinished((count) => {
              if (count >= 2) setPhase('home')
              return Math.min(count + 1, 3)
            })
          }
          return nextProgress
        })
      }, 80)
      return () => window.clearInterval(timer)
    }
  }, [phase, signal, walkerTurned])

  useEffect(() => {
    if (phase !== 'home') {
      setFinalMoment('hold')
      return
    }
    const fadeTimer = window.setTimeout(() => setFinalMoment('fade'), 1400)
    return () => {
      window.clearTimeout(fadeTimer)
    }
  }, [phase])

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  useEffect(() => {
    if (!cameraOn) return
    let frame = 0
    const holdSignal = createSignalHold()
    let greenArmed = true
    let lastGreen = -Infinity
    let lastSample = 0
    setSignal('unknown')
    setDetectedSignal(null)
    const detectSignal = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (performance.now() - lastSample >= 75 && target && video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        // Crop the original video before downsampling so a tiny LED keeps its detail.
        const cropWidth = video.videoWidth * 0.12
        const cropHeight = video.videoHeight * 0.12
        canvas.width = 96
        canvas.height = Math.max(1, Math.round(96 * cropHeight / cropWidth))
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(video, (target.x - 0.06) * video.videoWidth,
            (target.y - 0.06) * video.videoHeight, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          const next: Signal = detectLight(pixels, canvas.width, canvas.height)
          lastSample = performance.now()
          if (next === 'green') {
            if (greenArmed) {
              setAssemblyStep(step => Math.min(step + 1, 3))
              greenArmed = false
            }
            lastGreen = lastSample
          } else if (lastSample - lastGreen >= 250) {
            greenArmed = true
          }
          const stable = holdSignal(next, lastSample)
          setSignal(stable)
          setDetectedSignal(stable === 'unknown' ? null : stable)
        }
      }
      frame = window.requestAnimationFrame(detectSignal)
    }
    frame = window.requestAnimationFrame(detectSignal)
    return () => window.cancelAnimationFrame(frame)
  }, [cameraOn, target])

  const beginAssembly = () => {
    setPhase('assembly')
    setAssemblyStep(1)
    setWalkerProgress(0)
    setWalkerTurned(false)
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable in this browser or context.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
      setCameraError('')
      setDetectedSignal(null)
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const name = error instanceof DOMException ? error.name : 'UnknownError'
      setCameraError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and try again.' : `Camera could not start (${name}).`)
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setSignal('unknown')
    setCameraOn(false)
    setDetectedSignal(null)
  }

  const currentAsset = assemblyStep === 3 && signal === 'green' ? reactionAsset : assemblyAssets[Math.min(assemblyStep - 1, 2)]

  useEffect(() => {
    let cancelled = false
    const image = new Image()
    image.src = currentAsset
    image.onload = () => {
      const width = 700
      const height = Math.round(image.naturalHeight * width / image.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(image, 0, 0, width, height)
      const pixels = context.getImageData(0, 0, width, height)
      const barrier = new Uint8Array(width * height)
      const filled = new Uint8Array(width * height)
      const queue = new Int32Array(width * height)
      let tail = 0
      for (let index = 0; index < width * height; index += 1) barrier[index] = pixels.data[index * 4 + 3] > 45 ? 1 : 0
      const radius = 4
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (!barrier[y * width + x]) continue
          for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
            const px = x + dx
            const py = y + dy
            if (px >= 0 && px < width && py >= 0 && py < height) barrier[py * width + px] = 1
          }
        }
      }
      const seeds = [[.5, .17], [.5, .48], [.39, .56], [.61, .56], [.45, .78], [.55, .78]]
      const add = (x: number, y: number) => {
        const index = y * width + x
        if (x >= 0 && x < width && y >= 0 && y < height && !barrier[index] && !filled[index]) { filled[index] = 1; queue[tail++] = index }
      }
      for (const [x, y] of seeds) add(Math.round(x * width), Math.round(y * height))
      for (let head = 0; head < tail; head += 1) {
        const index = queue[head]
        const x = index % width
        if (x > 0) add(x - 1, Math.floor(index / width))
        if (x < width - 1) add(x + 1, Math.floor(index / width))
        if (index >= width) add(x, Math.floor(index / width) - 1)
        if (index < width * (height - 1)) add(x, Math.floor(index / width) + 1)
      }
      for (let index = 0; index < width * height; index += 1) {
        pixels.data[index * 4] = 243
        pixels.data[index * 4 + 1] = 238
        pixels.data[index * 4 + 2] = 220
        pixels.data[index * 4 + 3] = filled[index] ? 255 : 0
      }
      context.putImageData(pixels, 0, 0)
      if (!cancelled) setCharacterMask(canvas.toDataURL('image/png'))
    }
    return () => { cancelled = true }
  }, [currentAsset])


  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><span>◎</span> tiny signal lab</div>
        <div className="connection"><i className={cameraOn ? 'online' : ''} /> {cameraOn ? 'Camera connected' : 'Demo mode'}</div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">PHYSICAL PLAYGROUND / 01</p>
          <h1>One little light,<br /><em>one long way home.</em></h1>
          <p className="lede">Use the board's red and green signals to guide a tiny character from assembly to home.</p>
        </div>
        <div className="step-ribbon">
          <span className={phase === 'assembly' ? 'active' : ''}>01 <b>Assemble</b></span>
          <span className={phase === 'return' || phase === 'home' ? 'active' : ''}>02 <b>Walk home</b></span>
          <span className={phase === 'home' ? 'active' : ''}>03 <b>Arrive</b></span>
        </div>
      </section>

      <section className={`scene scene-${phase} signal-${signal} final-${finalMoment}`} style={{ '--scene-progress': `${walkerProgress / 100}` } as React.CSSProperties}>
        <div className="scene-meta"><span>{phase === 'assembly' ? 'ASSEMBLY BAY' : 'THE WALK HOME'}</span><span>Signal sensing</span></div>
        <div className="street-art" aria-hidden="true">
          <div className="building building-left"><i /><i /><i /></div>
          <div className="building building-right"><i /><i /><i /></div>
          <div className="car car-left"><i /><i /></div>
          <div className="car car-right"><i /><i /></div>
          <div className="house"><div className="roof" /><div className="door"><span>⌂</span></div><div className="window" /></div>
        </div>
        <div className={`character-wrap ${walkerTurned ? 'turned' : ''}`} style={{ '--progress': `${walkerProgress}%`, '--scene-progress': `${walkerProgress / 100}`, '--walk-scale': `${0.95 + walkerProgress / 100 * 3.65}` } as React.CSSProperties}>
          <div className="character-shadow" />
          {characterMask && <div className="character-fill" aria-hidden="true" style={{ '--character-mask': `url(${characterMask})` } as React.CSSProperties} />}
          <img className={`asset-character body-layer ${phase !== 'home' && walkerTurned ? 'side-view' : ''}`} src={currentAsset} alt={assemblyStep === 3 && signal === 'green' ? 'Green light reaction' : `Assembly stage ${Math.min(assemblyStep, 3)}`} />
          {phase !== 'home' && <span className="assembly-tag">{phase === 'assembly' ? `BUILD ${assemblyStep} / 3` : `WALKER ${finished + 1}`}</span>}
        </div>
        {phase === 'assembly' && <div className="assembly-copy"><strong>{signal === 'unknown' ? 'Waiting for a signal' : 'Assembling'}</strong><span>{signal === 'green' ? 'Green light: keep going' : signal === 'red' ? 'Red light: paused' : 'No light detected: not assembled'}</span></div>}
        {phase === 'home' && <div className="assembly-copy"><strong>Made it home</strong><span>The final little friend has arrived</span></div>}
      </section>

      <section className="control-grid">
        <div className="panel signal-panel">
          <div className="panel-label">LIVE SIGNAL <span>{cameraOn ? 'Camera detection' : 'Camera off'}</span></div>
          <div className="signal-row">
            <div className={`signal-readout ${signal}`}><span />{detectedSignal ? `${detectedSignal === 'green' ? 'Green' : 'Red'} detected` : cameraOn ? 'No signal detected' : 'Start camera'}</div>
          </div>
          <p className="hint">Click the signal light in the camera preview. Only the small box is scanned; keep wires and other lights outside it.</p>
        </div>

        <div className="panel progress-panel">
          <div className="panel-label">JOURNEY STATUS <span>{finished} / 3 home</span></div>
          <div className="progress-track"><div style={{ width: `${(finished / 3) * 100}%` }} /></div>
          <div className="mini-figures">{[0, 1, 2].map((item) => <span key={item} className={item < finished ? 'done' : ''}>●</span>)}</div>
        </div>

        <div className="panel camera-panel">
          <div className="panel-label">CAMERA INPUT <span>{cameraOn ? 'READY' : 'OPTIONAL'}</span></div>
          <div className="camera-preview" onClick={(event) => {
            if (!cameraOn) return
            const rect = event.currentTarget.getBoundingClientRect()
            setTarget({ x: Math.max(.06, Math.min(.94, (event.clientX - rect.left) / rect.width)),
              y: Math.max(.06, Math.min(.94, (event.clientY - rect.top) / rect.height)) })
          }}>
            <video ref={videoRef} autoPlay muted playsInline className={cameraOn ? 'video-visible' : ''} />
            {cameraOn && target && <div className="signal-target" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} />}
          </div>
          {cameraOn && <p className="hint">{target ? 'Keep the signal light inside the box. Click to reposition.' : 'Click on the LED to start detection.'}</p>}
          <canvas ref={canvasRef} className="camera-canvas" />
          <button className="camera-button" onClick={cameraOn ? stopCamera : startCamera}>{cameraOn ? 'Stop camera' : 'Start camera'} <span>↗</span></button>
          {cameraError && <small>{cameraError}</small>}
        </div>
      </section>

      <footer className="footer-actions">
        <button className="reset-button" onClick={beginAssembly}>↻ Restart</button>
        <div className="note">Asset slots · PNG 1 — PNG 4</div>
        {phase === 'assembly' && assemblyStep === 3 && <div className="advance-note">Assembling is finished. Let's begin the journey <span>→</span></div>}
      </footer>
    </main>
  )

}

export default App
