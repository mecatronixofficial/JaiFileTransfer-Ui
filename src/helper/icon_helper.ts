import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  CloudUpload,
  GitBranch,
  Lock,
  Mail,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';

const IconHelper = {
  Arrow: {
    Right: ArrowRight,
  },
  Home: {
    ShieldCheck,
    Zap,
    Lock,
    CloudUpload,
    Users,
    Activity,
    Mail,
    Github: GitBranch,
  },
} satisfies Record<string, Record<string, LucideIcon>>;

export default IconHelper;
