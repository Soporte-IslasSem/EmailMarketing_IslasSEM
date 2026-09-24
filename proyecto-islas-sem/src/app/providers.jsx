import { AuthProvider } from "../shared/hooks/useAuth";

export default function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
