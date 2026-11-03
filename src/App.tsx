import { Navigate, Outlet, createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AdminHome } from './pages/AdminHome';
import { AdminLayout } from './pages/AdminLayout';
import { GameDetail } from './pages/GameDetail';
import { GameEntry } from './pages/GameEntry';
import { GameHistory } from './pages/GameHistory';
import { Leaderboard } from './pages/Leaderboard';
import { Login } from './pages/Login';
import { Members } from './pages/Members';
import { NotFound } from './pages/NotFound';
import { PublicLayout } from './pages/PublicLayout';
import { SignUp } from './pages/SignUp';
import { StartGame } from './pages/StartGame';
import { AuthProvider, RequireMember, RequireSignIn } from './ui/auth';

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/signin', element: <Login /> },
      { path: '/signup', element: <SignUp /> },
      // Old admin sign-in link.
      { path: '/admin/login', element: <Navigate to="/signin" replace /> },
      {
        path: '/',
        element: (
          <RequireMember>
            <PublicLayout />
          </RequireMember>
        ),
        children: [
          { index: true, element: <Leaderboard /> },
          { path: 'games', element: <GameHistory /> },
          { path: 'games/:id', element: <GameDetail /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: '/admin',
        element: (
          <RequireSignIn>
            <AdminLayout />
          </RequireSignIn>
        ),
        children: [
          { index: true, element: <AdminHome /> },
          { path: 'new', element: <StartGame /> },
          { path: 'members', element: <Members /> },
          { path: 'games/:id', element: <GameEntry /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
