"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedRaysProps {
    /** Additional CSS classes */
    className?: string;
    /** Optional children to render over the background */
    children?: React.ReactNode;
}

export function AnimatedRays({
    className = "",
    children,
}: AnimatedRaysProps) {
    const [isDark, setIsDark] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const checkDark = () => document.documentElement.classList.contains("dark");
        setIsDark(checkDark());

        const observer = new MutationObserver(() => setIsDark(checkDark()));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    if (!mounted) return null;

    // Thin stripes to prevent the "blob" effect. 
    // Mostly transparent, with small bands of teal.
    const stripeColor = "rgba(42, 157, 143, 0.4)";
    const stripes = `repeating-linear-gradient(
        100deg,
        transparent 0%,
        transparent 12%,
        ${stripeColor} 14%,
        ${stripeColor} 18%,
        transparent 20%,
        transparent 32%,
        ${stripeColor} 34%,
        ${stripeColor} 36%,
        transparent 38%
    )`;

    return (
        <section className={cn("relative w-full h-full overflow-hidden", className)}>
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: stripes,
                    backgroundSize: "200%, 200%",
                    backgroundPosition: "50% 50%",
                    filter: "blur(8px)", // Soften the beams
                    maskImage: "radial-gradient(ellipse at 100% 0%, black 30%, transparent 80%)",
                    WebkitMaskImage: "radial-gradient(ellipse at 100% 0%, black 30%, transparent 80%)",
                }}
            >
                <div
                    className="absolute inset-0 animate-aurora-bg"
                    style={{
                        backgroundImage: stripes,
                        backgroundSize: "150%, 150%",
                        backgroundAttachment: "fixed",
                        mixBlendMode: isDark ? "screen" : "multiply", // Beautiful intersections
                    }}
                />
            </div>

            {children && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                    {children}
                </div>
            )}
        </section>
    );
}

export default AnimatedRays;
