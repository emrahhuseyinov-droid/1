import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { RulesPage } from '@/components/rules-page'

export async function generateMetadata(): Promise<Metadata> {
  const language = (await cookies()).get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'

  return language === 'ru'
    ? {
        title: 'Правила платформы и выплаты PEPE | pepe.casa',
        description: 'Правила pepe.casa о CAPTCHA-наградах, заданиях, честной игре и выводе PEPE, включая требования FaucetPay и лимиты выплат.'
      }
    : {
        title: 'Platform Rules & PEPE Payouts | pepe.casa',
        description: 'Read pepe.casa CAPTCHA reward, task, fair-play, and PEPE withdrawal rules, including FaucetPay requirements and payout limits.'
      }
}

export default function Page() {
  return <RulesPage />
}
