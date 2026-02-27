import { motion } from "framer-motion";
import { Mic, MessageSquare, Zap } from "lucide-react";

const steps = [
  {
    icon: Mic,
    title: "Ative o VoxType",
    description: "Use o atalho de teclado ou clique no ícone na bandeja do sistema.",
  },
  {
    icon: MessageSquare,
    title: "Fale normalmente",
    description: "Dite seu texto em qualquer janela aberta — Word, Chrome, Slack, qualquer app.",
  },
  {
    icon: Zap,
    title: "Texto instantâneo",
    description: "Suas palavras aparecem em tempo real, com pontuação inteligente e formatação automática.",
  },
];

const HowItWorks = () => {
  return (
    <section id="como-funciona" className="py-24 md:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Simples como <span className="text-gradient">falar</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Três passos para transformar sua voz em texto
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative text-center group"
            >
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px bg-border" />
              )}
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-secondary mb-6 group-hover:glow-border transition-all duration-300">
                <step.icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
