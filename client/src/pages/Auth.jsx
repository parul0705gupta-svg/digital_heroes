import Login from './Login';
import Signup from './Signup';

export default function Auth({ mode }) {
  if (mode === 'signup') {
    return <Signup />;
  }
  return <Login />;
}
