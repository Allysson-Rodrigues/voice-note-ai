import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const demoText = "O VoxType transforma cada palavra que você fala em texto preciso, instantaneamente. Sem erros, sem delay, sem complicação.";

const DemoSection = () => {
  const [displayed, setDisplayed] = useState("");
  const [charIndex, setCharIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsActive(true);
      },
      { threshold: 0.5 }
    );
    const el = document.getElementById("demo");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isActive) return;
    if (charIndex >= demoText.length) {
      const timeout = setTimeout(() => {
        setDisplayed("");
        setCharIndex(0);
      }, 3000);
      return () => clearTimeout(timeout);
    }
    const timeout = setTimeout(() => {
      setDisplayed(demoText.slice(0, charIndex + 1));
      setCharIndex(charIndex + 1);
    }, 40 + Math.random() * 30);
    return () => clearTimeout(timeout);
  }, [charIndex, isActive]);

  return (
    <section id="demo" className="py-24 md:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Veja em <span className="text-gradient">ação</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Assista o VoxType transformando fala em texto em tempo real
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto"
        >
          {/* Window mockup */}
          <div className="rounded-2xl border bg-card overflow-hidden glow-border">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-secondary/50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-muted-foreground/40" />
                <div className="w-3 h-3 rounded-full bg-primary/60" />
              </div>
              <span className="text-xs text-muted-foreground ml-2 font-mono">documento.txt — Bloco de Notas</span>
            </div>

            {/* Content */}
            <div className="p-8 min-h-[200px] font-mono text-sm md:text-base leading-relaxed">
              <span className="text-foreground">{displayed}</span>
              <span className="inline-block w-0.5 h-5 bg-primary ml-0.5 animate-pulse" />
            </div>

            {/* Status bar */}
            <div className="flex items-center justify-between px-4 py-2 border-t bg-secondary/30">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isActive && charIndex < demoText.length ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
                <span className="text-xs text-muted-foreground font-mono">
                  {isActive && charIndex < demoText.length ? "Ouvindo..." : "Pronto"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">PT-BR</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default DemoSection;
