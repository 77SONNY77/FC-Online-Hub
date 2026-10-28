import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, images: { remotePatterns: [{ protocol: 'https', hostname: 'fo4.dn.nexoncdn.co.kr', pathname: '/live/externalAssets/shop/items/product/*.png' }, { protocol: 'https', hostname: 'fco.dn.nexoncdn.co.kr', pathname: '/live/externalAssets/common/playersAction/p*.png' }] } };
export default config;
