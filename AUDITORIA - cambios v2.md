# Auditoría y cambios v2

## Correcciones aplicadas

1. Se corrigieron nombres de archivos que venían con codificación tipo `#U00f3`, `#U00e1`, etc.  
   Esto impedía que la app encontrara varias lecciones y CSVs porque las rutas del CSV usaban acentos reales.

2. Se validaron rutas locales de:
   - 48 lecciones
   - 48 visuales SVG
   - 15 imágenes de casos prácticos

3. Se agregó una vista nueva en la app: **Diagnóstico guiado**.

4. Se añadió semáforo de seguridad automático:
   - Verde: práctica de repaso segura con higiene y ficha.
   - Amarillo: práctica con criterio, supervisión, contraindicaciones y manual del equipo.
   - Rojo: no practicar como refuerzo; estudiar como alerta y derivar.

5. Se añadieron etiquetas de seguridad en:
   - Lecciones
   - Casos prácticos
   - Protocolos

6. Se añadió estilo visual para semáforo, árbol de decisión y checklist rápido.

## Validación realizada

- `App/app.js` pasa validación de sintaxis con Node.
- No hay rutas locales faltantes en lecciones, visuales ni casos.

## Siguiente mejora recomendada

El contenido ya funciona como MVP, pero las lecciones siguen siendo breves. Para que cada sesión realmente ocupe 1 hora, conviene ampliar cada día con:

- Mini lectura de 400 a 600 palabras.
- 1 caso corto.
- 3 a 5 flashcards.
- 1 pregunta de quiz.
- 1 checklist de seguridad o decisión.
- 1 actividad práctica con modelo, producto o etiqueta.

