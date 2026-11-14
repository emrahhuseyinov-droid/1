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
      description: 'Complete verified advertiser and partner tasks, manage PTC or YouTube campaigns, earn PEPE, and request FaucetPay payouts from one pepe.casa account.',
    }
  }

  return {
    title: 'pepe.casa | Награды, аркада и выплаты PEPE',
    description: 'Выполняйте проверенные задания рекламодателей и партнёров, создавайте PTC- и YouTube-кампании, получайте PEPE и выводите его через FaucetPay на pepe.casa.'
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
