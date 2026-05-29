import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  desc: string;
  tone?: string; // cor do dot/realce
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const } },
};

/** Card de estatística — estilo Kamui Dimension, tema porcelana. */
export default function StatCard({ icon: Icon, label, value, desc, tone }: StatCardProps) {
  const theme = useTheme();
  return (
    <motion.div variants={fadeUp}>
      <div className="void-panel rounded-2xl p-6 h-full relative overflow-hidden">
        {/* filigrana de canto */}
        <div
          className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
          style={{ background: `radial-gradient(circle at 100% 0%, ${theme.goldHaze}, transparent 70%)` }}
        />
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ background: theme.goldSoft, border: `1px solid ${theme.border}` }}
        >
          <Icon className="w-5 h-5" style={{ color: tone ?? theme.gold }} />
        </div>
        <div className="mt-5">
          <div className="text-3xl font-display font-bold tracking-tight" style={{ color: theme.text }}>
            {value}
          </div>
          <div className="text-[11px] font-semibold tracking-[0.2em] uppercase mt-1.5" style={{ color: theme.textSoft }}>
            {label}
          </div>
          <div className="text-xs mt-1" style={{ color: theme.textMute }}>
            {desc}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
