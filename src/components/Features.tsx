import { motion } from "framer-motion";
import { Monitor, Zap, Globe, Timer, Shield, Keyboard } from "lucide-react";

const features = [
  {
    icon: Monitor,
    title: "Qualquer janela",
    description: "Funciona em todos os aplicativos do Windows — Word, Chrome, VS Code, Slack e mais.",
  },
  {
    icon: Zap,
    title: "Tempo real",
    description: "Reconhecimento instantâneo com streaming de texto enquanto você fala.",
  },
  {
    icon: Globe,
    title: "Múltiplos idiomas",
    description: "Suporte a português, inglês, espanhol e dezenas de outros idiomas.",
  },
  {
    icon: Timer,
    title: "Baixa latência",
    description: "Menos de 200ms de delay. O texto aparece tão rápido quanto você fala.",
  },
  {
    icon: Shield,
    title: "Privacidade total",
    description: "Processamento local. Seus dados nunca saem do seu computador.",
  },
  {
    icon: Keyboard,
    title: "Atalhos customizáveis",
    description: "Configure teclas de atalho para ativar, pausar e personalizar comandos de voz.",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-24 md:py-32 relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-0 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Tudo que você <span className="text-gradient">precisa</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Recursos pensados para quem quer produtividade sem complicação
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group p-6 rounded-2xl bg-card border border-border hover:glow-border transition-all duration-300"
            >
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-secondary mb-4 group-hover:bg-primary/10 transition-colors">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
