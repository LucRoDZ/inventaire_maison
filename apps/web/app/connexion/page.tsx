import { LoginForm } from '../../components/auth/LoginForm';
import { Card } from '../../components/ui/Card';

export default function ConnexionPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <h1 className="text-title">Inventaire maison</h1>
      <Card>
        <h2 className="text-card-title mb-4">Connexion</h2>
        <LoginForm />
      </Card>
    </main>
  );
}
