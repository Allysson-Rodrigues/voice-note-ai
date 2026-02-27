import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "O VoxType funciona offline?",
    answer: "Sim! O processamento é feito localmente no seu computador, então você não precisa de internet para usar o VoxType. Seus dados nunca saem da sua máquina.",
  },
  {
    question: "Quais idiomas são suportados?",
    answer: "No plano Free, suportamos português brasileiro. No plano Pro, são mais de 30 idiomas incluindo inglês, espanhol, francês, alemão, japonês e muitos outros.",
  },
  {
    question: "Funciona em qualquer aplicativo?",
    answer: "Sim! O VoxType injeta texto diretamente onde seu cursor está posicionado — funciona em qualquer campo de texto de qualquer aplicativo do Windows.",
  },
  {
    question: "Qual a precisão do reconhecimento?",
    answer: "Nossa engine de reconhecimento tem mais de 98% de precisão para português brasileiro em condições normais de áudio. O vocabulário personalizado do plano Pro aumenta ainda mais a precisão para termos técnicos.",
  },
  {
    question: "Quando terá versão para Mac?",
    answer: "Estamos trabalhando na versão para macOS e planejamos lançá-la no segundo semestre de 2026. Inscreva-se na newsletter para ser notificado.",
  },
  {
    question: "Posso cancelar minha assinatura a qualquer momento?",
    answer: "Sim, sem compromisso. Você pode cancelar sua assinatura a qualquer momento e continuará tendo acesso até o fim do período já pago.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 md:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Perguntas <span className="text-gradient">frequentes</span>
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto"
        >
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border rounded-xl px-6 bg-card">
                <AccordionTrigger className="text-left hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};

export default FAQ;
