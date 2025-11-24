
import '../styles/globals.css'
import ErrorBoundary from '../components/ErrorBoundary'
import ProtectContent from '../components/ProtectContent'
import { Toaster } from 'react-hot-toast'

// Amplify setup
import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';
Amplify.configure(awsExports);

function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <ProtectContent />
      <Component {...pageProps} />
      <Toaster position="top-right" />
    </ErrorBoundary>
  )
}

export default MyApp
