import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { SiteLanguageProvider } from '@/components/site-language-provider'
import { RewardNotificationCenter } from '@/components/reward-notification-center'
import type { SiteLanguage } from '@/lib/site-translations'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const savedLanguage = (await cookies()).get('pepecasa_language')?.value
  if (savedLanguage === 'en') {
    return {
      title: 'pepe.casa | Rewards, Arcade & PEPE Payouts',
      description: 'Explore pepe.casa CAPTCHA rewards, verified tasks, the Wheel of Fortune, neon Arcade, PEPE and HOMERO balances, and payouts from one account.',
    }
  }

  return {
    title: 'pepe.casa | Награды, аркада и выплаты PEPE',
    description: 'Получайте награды за CAPTCHA и задания, вращайте колесо фортуны, играйте в неоновую аркаду и управляйте балансами PEPE и HOMERO на pepe.casa.',
  }
}


export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#10152f',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const savedLanguage = (await cookies()).get('pepecasa_language')?.value
  const initialLanguage: SiteLanguage = savedLanguage === 'en' ? 'en' : 'ru'

  return (
    <html lang={initialLanguage} className="dark">
      <body className="cartoon-site antialiased">
        <SiteLanguageProvider initialLanguage={initialLanguage}>
          {children}
          <RewardNotificationCenter />
        </SiteLanguageProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
