import React, { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { Mesh } from 'three'

const AnimatedCube: React.FC = () => {
  const meshRef = useRef<Mesh>(null)
  const [fadeIn, setFadeIn] = useState(0)

  // Smooth fade-in animation
  useEffect(() => {
    const timer = setTimeout(() => setFadeIn(1), 100)
    return () => clearTimeout(timer)
  }, [])

  // Smooth, enterprise-grade rotation animation with subtle breathing effect
  useFrame((state, delta) => {
    if (meshRef.current) {
      // Smooth rotation on multiple axes for a dynamic, professional effect
      meshRef.current.rotation.x += delta * 0.25
      meshRef.current.rotation.y += delta * 0.35
      // Subtle z-axis rotation for added depth
      meshRef.current.rotation.z += delta * 0.1
      
      // Subtle breathing effect via scale (very minimal)
      const breathing = 1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.01
      meshRef.current.scale.setScalar(breathing * fadeIn)
    }
  })

  // Calculate opacity with fade-in
  const baseOpacity = 1.0 // Solid cube
  const currentOpacity = baseOpacity * fadeIn

  return (
    <group>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <boxGeometry args={[0.912, 0.912, 0.912]} />
        {/* Completely flat solid grey material - no reflections or glare */}
        <meshStandardMaterial
          color="#2a2a2a"
          metalness={0}
          roughness={1.0}
          emissive="#000000"
          emissiveIntensity={0}
          transparent={false}
          opacity={1.0}
        />
        {/* Premium edge rendering - more refined for transparent material */}
        <Edges
          scale={1}
          threshold={15}
        >
          <lineBasicMaterial 
            color="#3a3a3a" 
            linewidth={1}
            transparent
            opacity={0.6 * fadeIn}
          />
        </Edges>
      </mesh>
    </group>
  )
}

export default AnimatedCube

