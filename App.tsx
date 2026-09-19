import { useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { ThemeProvider } from "./lib/theme";
import { Layout } from "./components/layout";
import { SplashScreen } from "./components/SplashScreen";
import { Loader2 } from "lucide-react";

import { Dashboard } from "./pages/dashboard";
import { Quiz } from "./pages/quiz";
import { LessonPlan } from "./pages/lesson-plan";
import { Assignment } from "./pages/assignment";
import { Grade } from "./pages/grade";
import { HistoryPage } from "./pages/history";
import { StudentPortal } from "./pages/student-portal";
import { StudentHistoryPage } from "./pages/student-history";
import { AuthPage } from "./pages/auth-page";
import { Profile } from "./pages/profile";

const queryClient = new QueryClient();

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-3">
      <h1 className="text-4xl font-bold text-white">404</h1>
      <p className="text-slate-400 text-sm">The page you are looking for does not exist.</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#030712] gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
      <p className="text-xs font-semibold text-slate-400 tracking-wide">Restoring your session...</p>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, signupInProgress } = useAuth();

  // Wait for Firebase to restore the session before deciding where to send the
  // user, otherwise the login screen flashes for signed-in people on every reload.
  if (loading && !user) {
    return <LoadingScreen />;
  }

  // 1. Agar user logged in nahi hai -> ALWAYS SHOW AUTH / LOGIN SCREEN
  // `signupInProgress` covers the moment inside signup() where Firebase has
  // technically signed the new user in; the studio must not appear for it.
  if (!user || signupInProgress) {
    return <AuthPage />;
  }

  // 2. Agar student login kiya -> Sirf Student Portal
  if (user.role === "student") {
    return (
      <Layout>
        <Switch>
          <Route path="/" component={StudentPortal} />
          <Route path="/student" component={StudentPortal} />
          <Route path="/student-portal" component={StudentPortal} />
          <Route path="/student-history" component={StudentHistoryPage} />
          <Route path="/profile" component={Profile} />
          <Route>
            <Redirect to="/student" />
          </Route>
        </Switch>
      </Layout>
    );
  }

  // 3. Agar teacher login kiya -> Full Teacher Command Center
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/quiz" component={Quiz} />
        <Route path="/history" component={HistoryPage} />
        <Route path="/lesson-plan" component={LessonPlan} />
        <Route path="/assignment" component={Assignment} />
        <Route path="/grade" component={Grade} />
        <Route path="/student" component={StudentPortal} />
        <Route path="/student-portal" component={StudentPortal} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

export function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
