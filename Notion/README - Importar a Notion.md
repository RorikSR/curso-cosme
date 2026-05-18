# Importar a Notion

Estos CSV estan preparados para crear bases de datos en Notion.

## Orden recomendado

1. Importar `Lecciones.csv`.
2. Importar `Ingredientes.csv`.
3. Importar `Protocolos.csv`.
4. Importar `Casos prácticos.csv`.
5. Importar `Flashcards.csv`.
6. Importar `Quizzes.csv`.
7. Importar `Recursos.csv`.
8. Importar `Visuales.csv`.

## Tipos sugeridos

### Lecciones

- Leccion: Title.
- Semana: Select.
- Dia: Select.
- Tema: Select o Multi-select.
- Objetivo: Text.
- Estado: Select.
- Recurso principal: Text o URL interna.

### Ingredientes

- Ingrediente: Title.
- Categoria: Select.
- Funcion: Text.
- Ideal para: Multi-select.
- Evitar o cuidar en: Multi-select.
- Marcas: Multi-select.
- Notas de seguridad: Text.

### Protocolos

- Protocolo: Title.
- Objetivo: Select.
- Tipo de piel: Multi-select.
- Condicion: Multi-select.
- Aparatologia: Multi-select.
- Contraindicaciones: Text.
- Paso a paso: Text.
- Cuidados posteriores: Text.

### Casos

- Caso: Title.
- Edad: Number.
- Biotipo: Select.
- Condicion: Multi-select.
- Observaciones: Text.
- Diagnostico estetico: Text.
- Objetivo: Select.
- Aparatologia elegida: Multi-select.
- Justificacion: Text.
- Seguimiento: Text.
- Imagenes: Files o Text. Si se importa como texto, separar por `;`.
- Fuente imagen: URL o Text.
- Credito: Text.

### Flashcards

- Pregunta: Title.
- Respuesta: Text.
- Tema: Select.
- Dificultad: Select.
- Semana: Select.
- Revisar otra vez: Checkbox.

### Quizzes

- Pregunta: Title.
- Semana: Select.
- Tema: Select.
- Dificultad: Select.
- Opciones: Text.
- Respuesta correcta: Text.
- Explicacion: Text.

### Visuales

- Leccion: Relation o Text.
- Tipo: Select.
- Titulo: Title.
- Imagen: Files o Text.
- Fuente: Text.
- Uso sugerido: Text.

## Nota

El contenido largo de cada sesion vive en `Lecciones/`. En Notion conviene importar primero el calendario y despues copiar o enlazar el contenido semanal segun se vaya usando.
