/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development'
});

const nextConfig = {
    reactStrictMode: true,
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:4000/api/:path*',
            },
        ];
    },
};

module.exports = withPWA(nextConfig);
