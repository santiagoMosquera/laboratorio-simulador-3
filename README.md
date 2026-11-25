# Laboratorio del Simulador 3

Taller de KrakeDev para AWS Certified AI Practitioner (AIF-C01). La interfaz y el guion enseñan conceptos que se aplican a distintos proveedores. Este prototipo usa OpenAI como proveedor de ejecución. Los manuales, números de cédula, porcentajes, horarios, intentos permitidos y calificaciones son ficticios.

## 1. Ejecutar en tu computador

1. Instala **Node.js 24 LTS**. Abre PowerShell o una terminal y verifica con `node -v`.
2. Descomprime el ZIP y abre una terminal en la carpeta `laboratorio-simulador`, donde están `package.json` y `vercel.json`.
3. Crea una clave en tu proyecto de [OpenAI API](https://platform.openai.com/api-keys) y verifica que el proyecto tenga facturación API y acceso al modelo elegido.
4. Copia `.env.example` a un archivo llamado `.env.local`. En PowerShell puedes ejecutar `Copy-Item .env.example .env.local`. En macOS o Linux usa `cp .env.example .env.local`.
5. Abre `.env.local` y asigna tus valores. Comparte con el grupo únicamente el código del laboratorio.

   ```dotenv
   OPENAI_API_KEY=tu_clave_de_api
   OPENAI_MODEL=gpt-6-luna
   LAB_ACCESS_CODE=un-codigo-para-tu-clase
   ```

6. Ejecuta `npm ci` y luego `npm run dev`. No hay dependencias externas que instalar. Abre [http://localhost:3000](http://localhost:3000). Si cambias una variable, reinicia el proceso.
7. Abre **Configuración**, escribe el código del laboratorio en **Acceso a la API** y vuelve a **Chat**. En la configuración inicial **Pregunta sola** ya puedes escribir `¿Con cuánto apruebo el Simulador 3?`.
8. Sigue [el guion completo](docs/GUION_TALLER.md). Los PDF descargables están dentro de la aplicación, en Configuración al elegir un modo documental. También están en `public/`.

La aplicación guarda configuraciones, chats, resultados y referencias en `sessionStorage`, que conserva los datos al recargar la pestaña. Cada pestaña sirve como sesión de práctica. El backend usa referencias firmadas y no depende de una base de datos. El código de acceso del taller protege las llamadas compartidas del prototipo. Está pensado para un grupo de clase y datos sintéticos.

## 2. Publicar en tu cuenta de Vercel

### Por la interfaz web

1. Sube el contenido de la carpeta `laboratorio-simulador` a un repositorio de GitHub. Comprueba que `package.json` y `vercel.json` estén en la raíz del repositorio y que `.env.local` quede excluido.
2. En [Vercel](https://vercel.com/new), elige **Add New → Project** e importa el repositorio. Si está en una subcarpeta, elige esa carpeta como **Root Directory**.
3. Usa el preset **Other**. El repositorio ya declara `public` como directorio de salida en `vercel.json`. No necesita un paso de compilación. La ruta `/api/lab` se despliega como Vercel Function.
4. En **Environment Variables**, agrega `OPENAI_API_KEY`, `OPENAI_MODEL` y `LAB_ACCESS_CODE` por separado. Selecciona **Production** y, si harás pruebas con previsualizaciones, habilita también **Preview**.
5. Pulsa **Deploy**. Visita la URL, introduce el código en **Configuración** y verifica primero **Pregunta sola**. Después carga el manual en el modo **RAG** y verifica que cambie a **Listo**.
6. Comparte con los alumnos la URL y el código. Si cambias variables después de publicar, genera un nuevo despliegue.

### Por la CLI, como alternativa

Desde el directorio del proyecto, ejecuta `npx vercel login` y `npx vercel link`. Agrega cada variable con `npx vercel env add NOMBRE production` y, para previsualizaciones, repite con `preview`. Prueba con `npx vercel deploy` y publica con `npx vercel deploy --prod`. Las órdenes de `env add` piden el valor de forma interactiva. [Flujo oficial de Vercel](https://vercel.com/docs/projects/deploy-from-cli).

## 3. Ubicar el front y el back

| Archivo | Función |
|---|---|
| `public/index.html`, `styles.css`, `app.js` | Front. Chat, configuración, persistencia en la pestaña, evidencias y tokens. |
| `api/lab.js` | Punto de entrada de la función de Vercel. |
| `server/lab.js` | Adaptador de OpenAI. Sube e indexa el manual, envía preguntas, ejecuta las herramientas ficticias y reúne el consumo. |
| `server/estudiantes.js` | Diez cédulas ficticias y porcentajes de avance. Incluye un listado de notas ficticias para la demostración de exposición. |
| `server/local.js` | Servidor de desarrollo que usa el mismo backend. |
| `test/lab.test.js` | Pruebas automatizadas con respuestas simuladas del proveedor. Ejecuta `npm test`. |

### Si algo falla

- **Código incorrecto.** Revisa el valor de `LAB_ACCESS_CODE` y el que ingresaste en Configuración.
- **Clave rechazada o límite de uso.** Revisa la clave y la facturación del proyecto API. Si tu proyecto usa otro modelo, selecciona uno que admita PDF, File Search y llamadas a funciones.
- **PDF procesando.** Espera a **Listo** antes de guardar. El laboratorio acepta hasta 4 MB por archivo. Si cambias de PDF adjunto a RAG, carga el archivo en el modo nuevo.
- **Referencia vencida.** Durante la práctica, las referencias se firman por 12 horas. Reinicia el chat o vuelve a cargar el PDF si es necesario.
- **RAG sin fragmentos.** Abre el panel de la respuesta. Usa una consulta explícita sobre el manual y comprueba que la configuración activa sea RAG y que el archivo esté listo.
- **Claves y datos de prueba.** El código del taller se usa para habilitar la API. Usa solamente los PDFs de práctica y las cédulas ficticias incluidas.

[Documentación de File Search](https://developers.openai.com/api/docs/guides/tools-file-search) · [Llamadas a funciones](https://developers.openai.com/api/docs/guides/function-calling) · [Variables de Vercel](https://vercel.com/docs/environment-variables)
