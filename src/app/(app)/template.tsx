/** Se vuelve a montar en cada navegación: la vista entra con la animación `.enter` (fade + desplazamiento + blur). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="enter flex flex-1 flex-col">{children}</div>;
}
