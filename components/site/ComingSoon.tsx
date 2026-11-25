import { EnquirySection } from './EnquirySection'

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
    <section className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Coming soon</h1>
      <p className="mt-4 max-w-md text-base text-slate-600">We&apos;re working on something new. Please check back shortly.</p>
    </section>
    <EnquirySection />
    </>
  )
}
