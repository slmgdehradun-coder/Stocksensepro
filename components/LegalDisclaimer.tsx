import { EDUCATIONAL_DISCLAIMER, SHORT_EDUCATIONAL_DISCLAIMER } from '@/lib/legal';

interface LegalDisclaimerProps {
  compact?: boolean;
  className?: string;
}

export default function LegalDisclaimer({ compact = false, className = '' }: LegalDisclaimerProps) {
  return (
    <div className={`rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-100 ${className}`}>
      {compact ? SHORT_EDUCATIONAL_DISCLAIMER : EDUCATIONAL_DISCLAIMER}
    </div>
  );
}
