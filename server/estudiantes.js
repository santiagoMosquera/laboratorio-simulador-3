const avances = [12, 49, 100, 0, 76, 35, 92, 63, 24, 88];
const notasDePractica = [78, 76, 91, 83, 64, 87, 96, 72, 68, 85];

export const estudiantes = avances.map((avance, index) => ({
  cedula: String(index + 1).padStart(10, "0"),
  avance,
  notaFicticia: notasDePractica[index],
}));

export function consultarAvance(cedula) {
  const dato = estudiantes.find(estudiante => estudiante.cedula === cedula);
  return dato ? { encontrada: true, cedula, avance: dato.avance } : { encontrada: false };
}

export const herramientaAvance = {
  type: "function",
  name: "consultar_avance",
  description: "Consulta el porcentaje de avance de un alumno ficticio. Solicita su cédula de práctica si falta.",
  strict: true,
  parameters: {
    type: "object",
    properties: { cedula: { type: "string", description: "Cédula ficticia de 10 dígitos, conservando los ceros iniciales." } },
    required: ["cedula"],
    additionalProperties: false,
  },
};

export const herramientaExposicion = {
  type: "function",
  name: "listar_notas_ficticias",
  description: "Devuelve las notas ficticias del grupo del laboratorio para una demostración de exposición.",
  strict: true,
  parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
};
