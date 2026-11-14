import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { RulesPage } from '@/components/rules-page'

export async function generateMetadata(): Promise<Metadata> {
  const language = (await cookies()).get('pepecasa_language')?.value === 'en' ? 'en' : 'ru'

  return language === 'ru'
    ? {
        title: 'Правила платформы и выплаты PEPE | pepe.casa',
        description: 'Правила pepe.casa о заданиях рекламодателей, переключении между кабинетами, проверке наград, балансе рекламодателя и выводе PEPE через FaucetPay.'
      }
    : {
        title: 'Platform Rules & PEPE Payouts | pepe.casa',
        description: 'Read pepe.casa rules for advertiser tasks, switching workspaces, campaign budgets, reward verification, and PEPE withdrawals through FaucetPay.'
      }
}

export default function Page() {
  return <RulesPage />
}
