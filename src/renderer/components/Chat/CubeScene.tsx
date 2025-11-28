import React, { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import AnimatedCube from './AnimatedCube'

const CubeScene: React.FC = () => {
  const [showText, setShowText] = useState(false)

  // Fade in text after cube animation starts
  useEffect(() => {
    const timer = setTimeout(() => setShowText(true), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      {/* 3D Cube Canvas - keep original size for proper cube rendering */}
      <div className="relative w-full h-[50vh] flex items-center justify-center">
        <Canvas
          className="w-full h-full"
          camera={{ position: [0, 0.5, 5], fov: 50 }}
          gl={{ 
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
            preserveDrawingBuffer: false
          }}
          dpr={[1, Math.min(window.devicePixelRatio, 2)]} // Adaptive pixel ratio for performance
          frameloop="always"
        >
          {/* Uniform ambient light for flat, solid appearance */}
          <ambientLight intensity={1.0} />
          
          {/* Animated cube - solid grey */}
          <AnimatedCube />
        </Canvas>
      </div>

      {/* Text positioned absolutely relative to center point (where cube visually appears) */}
      <div 
        className={`absolute top-[calc(50%+120px)] transition-opacity duration-700 ${
          showText ? 'opacity-30' : 'opacity-0'
        }`}
      >
        <p className="text-dark-text-secondary text-sm font-light tracking-wide text-glow-animation" data-text="Start a conversation to begin">
          Start a conversation to begin
        </p>
      </div>
    </div>
  )
}

export default CubeScene

