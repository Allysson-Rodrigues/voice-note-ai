import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Github, Twitter, Linkedin, Send } from "lucide-react";

const footerLinks = {
  Produto: ["Features", "Preços", "Download", "Changelog"],
  Suporte: ["Documentação", "FAQ", "Contato", "Status"],
  Legal: ["Privacidade", "Termos de Uso", "Cookies"],
};

const Footer = () => {
  return (
    <footer className="border-t py-16">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-12">
          {/* Brand + newsletter */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="font-mono font-bold text-primary-foreground text-sm">V</span>
              </div>
              <span className="font-semibold text-lg">VoxType</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Transforme sua voz em texto instantaneamente. Ditação inteligente para Windows.
            </p>
            <div className="flex gap-2">
              <Input placeholder="Seu e-mail" className="h-9 text-sm" />
              <Button size="sm" className="gap-1 shrink-0">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-sm mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mt-12 pt-8 border-t gap-4">
          <p className="text-xs text-muted-foreground">
            © 2026 VoxType. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              <Twitter className="h-4 w-4" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              <Github className="h-4 w-4" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              <Linkedin className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
