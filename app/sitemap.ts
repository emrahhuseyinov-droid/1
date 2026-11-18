import type { MetadataRoute } from 'next'

const siteUrl = 'https://pepe.casa'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl },
    { url: `${siteUrl}/rules` },
  ]
}
