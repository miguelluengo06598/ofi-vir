/** Se vuelve a montar en cada navegación: la vista entra deslizándose (sin opacity/filter, que anularían el desenfoque del cristal que contiene). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="enter-slide flex flex-1 flex-col">{children}</div>;
}
