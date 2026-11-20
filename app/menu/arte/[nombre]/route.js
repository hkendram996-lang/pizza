// Enlace antiguo: las ilustraciones ahora están en /public/menu
export function GET(req) {
  return Response.redirect(new URL('/menu/portada.webp', req.url), 308);
}
