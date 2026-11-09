import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { RulesPage } from '@/components/rules-page'

export async function generateMetadata(): Promise<Metadata> {
  const language = (await cookies()).get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'

  return language === 'ru'
    ? {
        title: 'Правила платформы и выплаты PEPE | pepe.casa',
        description: 'Правила pepe.casa о наградах, честной игре и выводе средств, включая требования FaucetPay и лимиты выплат PEPE.',
      }
    : {
        title: 'Platform Rules & PEPE Payouts | pepe.casa',
        description: 'Read pepe.casa reward, fair-play, and withdrawal rules, including FaucetPay requirements and PEPE payout limits.',
      }
}

export default function Page() {
  return <RulesPage />
}
