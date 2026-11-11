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
      description: 'Complete reward activities, play the neon Arcade, and request PEPE payouts through FaucetPay. Withdrawals require a verified FaucetPay account, with a 1,000 PEPE minimum and a 50,000 PEPE daily cap.',
    }
  }

  return {
    title: 'pepe.casa | Награды, аркада и выплаты PEPE',
    description: 'Выполняйте задания, играйте в неоновую аркаду и запрашивайте выплаты PEPE через FaucetPay. Для вывода нужен подтверждённый аккаунт FaucetPay: минимум 1 000 PEPE, дневной лимит — 50 000 PEPE.',
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
