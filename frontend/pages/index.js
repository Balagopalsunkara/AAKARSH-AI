import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Home.module.css';
import { useState, useEffect } from 'react';

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={styles.container}>
      <Head>
        <title>AI-APP | Local Intelligence</title>
        <meta name="description" content="Private, secure, and powerful local AI chat." />
      </Head>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>
            Intelligence, <br />
            <span className={styles.highlight}>Privately Hosted.</span>
          </h1>

          <p className={styles.subtitle}>
            Experience the power of AI without compromising your data.
            Run advanced models locally on your machine with zero third-party dependencies.
          </p>

          <div className={styles.ctaGroup}>
            <button onClick={() => router.push('/chat')} className={styles.primaryButton}>
              <span>Start Chatting</span>
              <span>→</span>
            </button>
            <button onClick={() => window.open('https://github.com/Balagopalsunkara/AI-APP', '_blank')} className={styles.secondaryButton}>
              View Source
            </button>
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <span className={styles.icon}>🔒</span>
              <h3 className={styles.featureTitle}>100% Private</h3>
              <p className={styles.featureDesc}>
                Your data never leaves your device. All processing happens locally using optimized on-device models.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.icon}>⚡</span>
              <h3 className={styles.featureTitle}>Zero Latency</h3>
              <p className={styles.featureDesc}>
                No network delays. Experience instant responses powered by local CPU/GPU inference.
              </p>
            </div>

            <div className={styles.featureCard}>
              <span className={styles.icon}>🧠</span>
              <h3 className={styles.featureTitle}>Smart Models</h3>
              <p className={styles.featureDesc}>
                Choose from Phi-1.5, TinyLlama, or connect to Ollama for even more power.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>AI-APP Local Edition • Built for Privacy</p>
      </footer>
    </div>
  );
}
