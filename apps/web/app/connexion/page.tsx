import { LoginForm } from '../../components/auth/LoginForm';
import { Card } from '../../components/ui/Card';

export default function ConnexionPage() {
  return (
    // The page never scrolls: this screen scrolls by itself when the keyboard or a landscape
    // phone leaves it too little height.
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
      <div className="m-auto flex w-full max-w-md flex-col gap-6">
        <h1 className="text-title">Inventaire maison</h1>
        <Card>
          <h2 className="text-card-title mb-4">Connexion</h2>
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
