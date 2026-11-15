import { Check, Share, SquarePlus, type LucideIcon } from 'lucide-react';

const STEPS: { icon: LucideIcon; text: string }[] = [
  { icon: Share, text: 'Touchez le bouton Partager de Safari.' },
  { icon: SquarePlus, text: 'Choisissez « Sur l’écran d’accueil ».' },
  { icon: Check, text: 'Touchez « Ajouter » en haut à droite.' },
];

/** The three steps of the iOS home-screen installation, each with its glyph. */
export function IosInstallSteps() {
  return (
    <ol className="flex flex-col gap-2">
      {STEPS.map(({ icon: Icon, text }, index) => (
        <li key={text} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-lavender text-indigo inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          >
            <Icon size={18} />
          </span>
          <span>
            <strong>Étape {index + 1}.</strong> {text}
          </span>
        </li>
      ))}
    </ol>
  );
}
