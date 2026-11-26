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

6. Ejecuta `npm ci` y luego `npm run dev`. Abre [http://localhost:3000](http://localhost:3000). Si cambias una variable, reinicia el proceso.
7. Abre **Configuración**, escribe el código del laboratorio en **Acceso a la API** y vuelve a **Chat**. En la configuración inicial **Pregunta sola** ya puedes escribir `¿Con cuánto apruebo el Simulador 3?`.
8. Sigue [el guion completo](docs/GUION_TALLER.md). Los PDF descargables están dentro de la aplicación, en Configuración al elegir un modo documental. También están en `public/`.

La aplicación guarda configuraciones, chats, resultados y referencias en `sessionStorage`, que conserva los datos al recargar la pestaña. Cada pestaña sirve como sesión de práctica. El backend usa referencias firmadas y no depende de una base de datos. El código de acceso del taller protege las llamadas compartidas del prototipo. Está pensado para un grupo de clase y datos sintéticos.

## 2. Publicar en tu cuenta de Vercel

### Por la interfaz web

1. Sube el contenido de la carpeta `laboratorio-simulador` a un repositorio de GitHub. Comprueba que `package.json` y `vercel.json` estén en la raíz del repositorio y que `.env.local` quede excluido.
2. En [Vercel](https://vercel.com/new), elige **Add New → Project** e importa el repositorio. Si está en una subcarpeta, elige esa carpeta como **Root Directory**.
3. Usa el preset **Other**. El repositorio ya declara `public` como directorio de salida en `vercel.json`. No necesita un paso de compilación. Las rutas `/api/lab` y `/api/mcp` se despliegan como Vercel Functions.
4. En **Environment Variables**, agrega `OPENAI_API_KEY`, `OPENAI_MODEL` y `LAB_ACCESS_CODE` por separado. Selecciona **Production** y, si harás pruebas con previsualizaciones, habilita también **Preview**.
5. Pulsa **Deploy**. Visita la URL, introduce el código en **Configuración** y verifica primero **Pregunta sola**. Después carga el manual en el modo **RAG** y verifica que cambie a **Listo**.
6. Comparte con los alumnos la URL y el código. Si cambias variables después de publicar, genera un nuevo despliegue.

### Por la CLI, como alternativa

Desde el directorio del proyecto, ejecuta `npx vercel login` y `npx vercel link`. Agrega cada variable con `npx vercel env add NOMBRE production` y, para previsualizaciones, repite con `preview`. Prueba con `npx vercel deploy` y publica con `npx vercel deploy --prod`. Las órdenes de `env add` piden el valor de forma interactiva. [Flujo oficial de Vercel](https://vercel.com/docs/projects/deploy-from-cli).

## 3. Demostrar MCP

1. En Vercel, agrega **`MCP_ACCESS_TOKEN`** como secreto del servidor. Usa un token aleatorio, distinto del código del laboratorio y de la clave de OpenAI. Puedes generarlo con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
2. Configura **`MCP_SERVER_URL`** con la URL HTTPS completa de la ruta, por ejemplo `https://tu-proyecto.vercel.app/api/mcp`. Vuelve a desplegar. La API de OpenAI necesita poder llegar a esa URL. Si usas un despliegue protegido por Vercel, usa para el taller una URL donde la API pueda alcanzar la ruta y autenticarse con el token MCP.
3. En el frontend, abre **Configuración → Consulta de avance por cédula ficticia**. Crea una variante con **Llamada directa (function calling)** y otra con **Servidor MCP**. Para una comparación limpia, desactiva el historial, el listado de notas y el documento. En chats nuevos pregunta en ambas variantes «Usa la herramienta para consultar el avance de la cédula ficticia 0000000002». El catálogo devuelve **49 %**.
4. Compara **Ver JSON enviado a OpenAI** en ambas respuestas. En la directa aparece `function_call_output` en una segunda llamada de nuestro backend. En MCP aparece la definición del servidor y puedes abrir **Ver traza MCP de OpenAI** para ver `mcp_list_tools` y `mcp_call` cuando la API los devuelve. El visor oculta el token.

El chat local también puede usar MCP si `.env.local` apunta a la URL HTTPS de Vercel y contiene el mismo token del servidor remoto. El cliente de tutores funciona contra el servidor local y contra Vercel.

### Segundo cliente MCP · Asistente de tutores

Desde otra terminal, con `MCP_ACCESS_TOKEN` configurado en `.env.local`, ejecuta:

```sh
npm run demo:tutores -- 0000000002
```

El cliente usa `MCP_SERVER_URL` si está configurada. En su ausencia se conecta a `http://127.0.0.1:3000/api/mcp`. Para forzar la ruta local con el servidor en ejecución, usa `npm run demo:tutores -- 0000000002 http://127.0.0.1:3000/api/mcp`. La consola muestra el catálogo con `tools/list` y el resultado con `tools/call`. Este cliente de demostración realiza la consulta directamente por MCP y puede funcionar sin una clave de OpenAI.

## 4. Ubicar el front y el back

| Archivo | Función |
|---|---|
| `public/index.html`, `styles.css`, `app.js` | Front. Chat, configuración, persistencia en la pestaña, evidencias y tokens. |
| `api/lab.js` | Punto de entrada del chat y la carga de PDF. |
| `api/mcp.js`, `server/mcp.js` | Servidor MCP Streamable HTTP. Publica únicamente la herramienta de avance. |
| `scripts/tutores.js` | Segundo cliente MCP para demostrar reutilización. |
| `server/lab.js` | Adaptador de OpenAI. Sube e indexa el manual, envía preguntas, ejecuta las herramientas ficticias y reúne el consumo. |
| `server/estudiantes.js` | Diez cédulas ficticias y porcentajes de avance. Incluye un listado de notas ficticias para la demostración de exposición. |
| `server/local.js` | Servidor de desarrollo que usa el mismo backend. |
| `test/lab.test.js`, `test/mcp.test.js` | Pruebas del adaptador con respuestas simuladas de OpenAI y del servidor con un cliente MCP. Ejecuta `npm test`. |

### Si algo falla

- **Código incorrecto.** Revisa el valor de `LAB_ACCESS_CODE` y el que ingresaste en Configuración.
- **Clave rechazada o límite de uso.** Revisa la clave y la facturación del proyecto API. Si tu proyecto usa otro modelo, selecciona uno que admita PDF, File Search y llamadas a funciones.
- **PDF procesando.** Espera a **Listo** antes de guardar. El laboratorio acepta hasta 4 MB por archivo. Si cambias de PDF adjunto a RAG, carga el archivo en el modo nuevo.
- **Referencia vencida.** Durante la práctica, las referencias se firman por 12 horas. Reinicia el chat o vuelve a cargar el PDF si es necesario.
- **RAG sin fragmentos.** Abre el panel de la respuesta. Usa una consulta explícita sobre el manual y comprueba que la configuración activa sea RAG y que el archivo esté listo.
- **Claves y datos de prueba.** El código del taller se usa para habilitar la API. Usa solamente los PDFs de práctica y las cédulas ficticias incluidas.

[Documentación de File Search](https://developers.openai.com/api/docs/guides/tools-file-search) · [Llamadas a funciones](https://developers.openai.com/api/docs/guides/function-calling) · [Variables de Vercel](https://vercel.com/docs/environment-variables)

[Documentación de MCP en OpenAI](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
