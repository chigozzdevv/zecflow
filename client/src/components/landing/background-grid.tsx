import React, { useEffect, useState, useRef } from 'react'

interface BackgroundGridProps {
    mouse: { x: number; y: number } | null
}

export default function BackgroundGrid({ mouse }: BackgroundGridProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                })
            }
        }

        updateDimensions()
        window.addEventListener('resize', updateDimensions)
        return () => window.removeEventListener('resize', updateDimensions)
    }, [])

    const cell = 24 // Cell size
    const gap = 1   // Gap size
    const cols = Math.ceil(dimensions.width / (cell + gap))
    const rows = Math.ceil(dimensions.height / (cell + gap))
    const cells = Array.from({ length: cols * rows })

    // Interaction radius
    const radiusX = 300
    const radiusY = 300
    const sin = Math.sin(0) // No rotation for now
    const cos = Math.cos(0)

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none select-none">
            <div
                className="absolute inset-0 grid"
                style={{
                    gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
                    gridTemplateRows: `repeat(${rows}, ${cell}px)`,
                    gap: `${gap}px`,
                    justifyContent: 'center',
                    alignContent: 'center',
                }}
            >
                {cells.map((_, i) => {
                    const c = i % cols
                    const r = Math.floor(i / cols)
                    const cx = c * (cell + gap) + cell / 2
                    const cy = r * (cell + gap) + cell / 2

                    let intensity = 0
                    if (mouse) {
                        const dx = cx - mouse.x
                        const dy = cy - mouse.y
                        const rx = dx * cos - dy * sin
                        const ry = dx * sin + dy * cos
                        const d = Math.sqrt((rx / radiusX) ** 2 + (ry / radiusY) ** 2)
                        intensity = Math.max(0, 1 - d)
                        intensity = Math.pow(intensity, 1.4)
                    }

                    const fromA = 0.4 * intensity
                    const toA = 0.2 * intensity

                    // Using brand colors: #6758c1 (103, 88, 193) and #5344ad (83, 68, 173)
                    const style: React.CSSProperties = intensity > 0.02
                        ? {
                            background: `linear-gradient(135deg, rgba(103, 88, 193,${fromA}) 0%, rgba(83, 68, 173,${toA}) 100%)`,
                            opacity: Math.min(0.6, 0.05 + intensity * 0.7),
                            transition: 'opacity 120ms linear',
                        }
                        : {
                            opacity: 0,
                        }

                    return (
                        <div key={i} className="relative">
                            {/* Grid border */}
                            <div className="absolute inset-0 rounded-sm border border-zinc-900/60" />

                            {/* Glow effect */}
                            <div
                                className="absolute inset-0 rounded-sm"
                                style={style}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
