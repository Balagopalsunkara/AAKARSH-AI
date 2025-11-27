import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                <link rel="manifest" href="/manifest.json" />
                <link rel="apple-touch-icon" href="/icon.svg" />
                <meta name="theme-color" content="#1c1c21" />
                <meta name="description" content="AAKARSH AI - Advanced Local AI Assistant" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
