'use client'

import { useEffect, useRef, useState } from 'react'

type Layer = {
  id: number
  source: AudioBufferSourceNode
  gain: GainNode
  createdAt: number
  buffer: AudioBuffer
}

export default function Home() {
  const [recording, setRecording] =
    useState(false)

  const [layerCount, setLayerCount] =
    useState(0)

  const [status, setStatus] =
    useState('READY')

  const chunksRef = useRef<Blob[]>([])

  const layersRef = useRef<Layer[]>([])

  const nextIdRef = useRef(0)

  const compressingRef =
    useRef(false)

  const audioContextRef =
    useRef<AudioContext | null>(null)

  // -----------------------------------
  // AudioContext
  // -----------------------------------
  useEffect(() => {
    if (typeof window === 'undefined')
      return

    const AudioCtx =
      window.AudioContext ||
      // @ts-ignore
      window.webkitAudioContext

    const ctx = new AudioCtx()

    audioContextRef.current = ctx

    return () => {
      try {
        layersRef.current.forEach(
          (layer) => {
            try {
              layer.source.stop()
              layer.source.disconnect()
              layer.gain.disconnect()
            } catch {}
          }
        )

        ctx.close()
      } catch {}
    }
  }, [])

  // -----------------------------------
  // degradation loop
  // -----------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const ctx =
        audioContextRef.current

      if (!ctx) return

      const now = Date.now()

      layersRef.current.forEach(
        (layer) => {
          const age =
            (now -
              layer.createdAt) /
            1000

          // volume decay
          const volume = Math.max(
            0.02,
            1 - age / 3600
          )

          // slowdown decay
          const playbackRate =
            Math.max(
              0.2,
              1 - age / 1200
            )

          layer.gain.gain.setValueAtTime(
            volume,
            ctx.currentTime
          )

          layer.source.playbackRate.setValueAtTime(
            playbackRate,
            ctx.currentTime
          )
        }
      )
    }, 3000)

    return () =>
      clearInterval(interval)
  }, [])

  // -----------------------------------
  // sync count
  // -----------------------------------
  function syncLayerCount() {
    setLayerCount(
      layersRef.current.length
    )
  }

  // -----------------------------------
  // create layer
  // -----------------------------------
  async function createLayer(
    buffer: AudioBuffer
  ) {
    try {
      const ctx =
        audioContextRef.current

      if (!ctx) return

      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const source =
        ctx.createBufferSource()

      source.buffer = buffer
      source.loop = true

      const gain =
        ctx.createGain()

      gain.gain.value = 1

      source.connect(gain)
      gain.connect(ctx.destination)

      source.start(0)

      const layer: Layer = {
        id: nextIdRef.current++,
        source,
        gain,
        createdAt: Date.now(),
        buffer,
      }

      layersRef.current.push(layer)

      syncLayerCount()

      console.log(
        'layer created',
        layer.id
      )

      setStatus(
        `LAYER ${layer.id} ADDED`
      )

      // compress every 3 layers
      if (
        layersRef.current.length >= 3
      ) {
        compressLayers()
      }
    } catch (err) {
      console.error(
        'createLayer error',
        err
      )

      setStatus('PLAY ERROR')
    }
  }

  // -----------------------------------
  // compression
  // -----------------------------------
  async function compressLayers() {
    if (compressingRef.current)
      return

    compressingRef.current = true

    try {
      const ctx =
        audioContextRef.current

      if (!ctx) return

      if (
        layersRef.current.length < 3
      )
        return

      setStatus('COMPRESSING')

      const targets =
        layersRef.current.slice(0, 3)

      const maxDuration = Math.min(
        60,
        Math.max(
          ...targets.map(
            (layer) =>
              layer.buffer.duration /
              Math.max(
                0.2,
                layer.source.playbackRate
                  .value
              )
          )
        )
      )

      const offline =
        new OfflineAudioContext(
          1,
          Math.ceil(
            ctx.sampleRate *
              maxDuration
          ),
          ctx.sampleRate
        )

      targets.forEach((layer) => {
        const source =
          offline.createBufferSource()

        source.buffer =
          layer.buffer

        source.loop = true

        source.playbackRate.value =
          layer.source.playbackRate.value

        const gain =
          offline.createGain()

        gain.gain.value =
          layer.gain.gain.value * 0.7

        source.connect(gain)

        gain.connect(
          offline.destination
        )

        source.start(0)
      })

      const rendered =
        await offline.startRendering()

      // old cleanup
      targets.forEach((layer) => {
        try {
          layer.source.stop()
          layer.source.disconnect()
          layer.gain.disconnect()
        } catch {}
      })

      layersRef.current =
        layersRef.current.slice(3)

      syncLayerCount()

      await createLayer(rendered)

      setStatus('COMPRESSED')
    } catch (err) {
      console.error(
        'compress error',
        err
      )

      setStatus('COMPRESS ERROR')
    } finally {
      compressingRef.current = false
    }
  }

  // -----------------------------------
  // recording
  // -----------------------------------
  async function startRecording() {
    try {
      const ctx =
        audioContextRef.current

      if (!ctx) return

      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      setStatus('MIC ACCESS')

      const stream =
        await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
          }
        )

      const mimeType =
        MediaRecorder.isTypeSupported(
          'audio/webm'
        )
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder =
        new MediaRecorder(stream, {
          mimeType,
        })

      chunksRef.current = []

      recorder.ondataavailable = (
        e
      ) => {
        if (e.data.size > 0) {
          chunksRef.current.push(
            e.data
          )
        }
      }

      recorder.onstop = async () => {
        try {
          setStatus('DECODING')

          const blob = new Blob(
            chunksRef.current,
            {
              type: mimeType,
            }
          )

          if (blob.size === 0) {
            setStatus('EMPTY AUDIO')
            return
          }

          console.log(
            'blob size',
            blob.size
          )

          const arrayBuffer =
            await blob.arrayBuffer()

          const decoded =
            await ctx.decodeAudioData(
              arrayBuffer
            )

          await createLayer(decoded)

          setStatus('PLAYING')
        } catch (err) {
          console.error(
            'decode error',
            err
          )

          setStatus(
            'DECODE FAILED'
          )
        } finally {
          stream
            .getTracks()
            .forEach((t) =>
              t.stop()
            )
        }
      }

      recorder.start()

      setRecording(true)

      setStatus('RECORDING')

      setTimeout(() => {
        if (
          recorder.state !==
          'inactive'
        ) {
          recorder.stop()

          setRecording(false)
        }
      }, 10000)
    } catch (err) {
      console.error(
        'recording error',
        err
      )

      setRecording(false)

      setStatus('MIC ERROR')
    }
  }

  // -----------------------------------
  // UI
  // -----------------------------------
  return (
    <main className='min-h-screen bg-black text-white flex flex-col items-center justify-center overflow-hidden relative px-6'>
      <div className='absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,white,transparent)]' />

      <div className='z-10 flex flex-col items-center gap-8'>
        <h1 className='text-6xl md:text-7xl tracking-tight text-center'>
          VOICE STRATA
        </h1>

        <p className='text-zinc-500 text-center leading-relaxed'>
          投稿された声は
          <br />
          堆積し続ける
        </p>

        <button
          onClick={startRecording}
          disabled={recording}
          className='bg-white text-black px-8 py-5 rounded-full text-lg hover:scale-105 transition disabled:opacity-40'
        >
          {recording
            ? 'RECORDING...'
            : 'RECORD 10 SECONDS'}
        </button>

        <div className='text-sm text-zinc-600 tracking-widest'>
          {status}
        </div>
      </div>

      <div className='fixed bottom-6 text-xs text-zinc-700 tracking-widest'>
        layers: {layerCount}
      </div>
    </main>
  )
}