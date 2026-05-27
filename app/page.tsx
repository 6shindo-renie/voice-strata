'use client'

import { useRef, useState } from 'react'

export default function Home() {
  const [recording, setRecording] = useState(false)

  const chunksRef =
    useRef<Blob[]>([])

  const audiosRef =
    useRef<HTMLAudioElement[]>([])

  async function startRecording() {
    const stream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

    const mediaRecorder =
      new MediaRecorder(stream)

    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      const blob = new Blob(
        chunksRef.current,
        {
          type: 'audio/webm',
        }
      )

      const url =
        URL.createObjectURL(blob)

      const audio = new Audio(url)

      audio.loop = true

      audio.volume = 1

      audiosRef.current.push(audio)

      setTimeout(() => {
        audio.play()
      }, 100)

      // 古い声ほど遅くなる
      setInterval(() => {

        if (
          audio.playbackRate > 0.2
        ) {

          audio.playbackRate -= 0.05
        }

      }, 10000)

      // 10分ごとに薄くなる
      setInterval(() => {

        if (
          audio.volume > 0.05
        ) {

          audio.volume -= 0.08
        }

      }, 600000)
    }

    mediaRecorder.start()

    setRecording(true)

    setTimeout(() => {
      mediaRecorder.stop()

      setRecording(false)
    }, 10000)
  }

  return (
    <main className='min-h-screen bg-black text-white flex flex-col items-center justify-center gap-10 overflow-hidden'>

      <div className='absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,white,transparent)]' />

      <h1 className='text-6xl tracking-tight text-center z-10'>
        VOICE STRATA
      </h1>

      <p className='text-zinc-500 text-center max-w-sm z-10 leading-relaxed'>
        投稿された声は
        永遠にループし続ける
      </p>

      <button
        onClick={startRecording}
        disabled={recording}
        className='z-10 bg-white text-black px-8 py-5 rounded-full text-lg hover:scale-105 transition'
      >
        {recording
          ? 'RECORDING...'
          : 'RECORD 10 SECONDS'}
      </button>

    </main>
  )
}