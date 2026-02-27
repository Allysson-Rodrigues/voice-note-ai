import { motion } from "framer-motion";

const bars = 40;

const SoundWave = () => {
  return (
    <div className="flex items-center justify-center gap-[3px] h-24">
      {Array.from({ length: bars }).map((_, i) => {
        const center = bars / 2;
        const dist = Math.abs(i - center) / center;
        const maxH = 80 * (1 - dist * 0.7);
        const delay = i * 0.05;

        return (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-primary/60"
            animate={{
              height: [maxH * 0.3, maxH, maxH * 0.3],
            }}
            transition={{
              duration: 1.2 + Math.random() * 0.5,
              repeat: Infinity,
              delay,
              ease: "easeInOut",
            }}
            style={{ height: maxH * 0.3 }}
          />
        );
      })}
    </div>
  );
};

export default SoundWave;
