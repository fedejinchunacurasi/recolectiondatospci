# 📋 Inspector PCI — UNA Puno
### Sistema de Recolección de Datos · Pavimento Flexible · ASTM D6433

---

## 📦 Archivos del proyecto

```
📦 inspector_pci/
 ┣ 📄 index.html   → Estructura HTML de la aplicación
 ┣ 📄 style.css    → Estilos, diseño responsivo y tema visual
 ┣ 📄 script.js    → Lógica, cálculos, geolocalización, fotos
 ┗ 📄 README.md    → Esta guía
```

Los tres archivos deben estar **en la misma carpeta** para que la app funcione.

---

## 🚀 Cómo usar

### Opción A — Desde un computador o servidor
1. Coloca los 3 archivos en una carpeta.
2. Abre `index.html` en cualquier navegador moderno (Chrome, Firefox, Edge, Safari).

### Opción B — Desde el celular (recomendado en campo)
1. Copia los 3 archivos a tu celular o ábrelos desde un servidor local.
2. En Chrome/Safari, abre `index.html`.
3. Usa el menú "Agregar a pantalla de inicio" para instalarla como app.

> **Sin internet:** La app funciona completamente sin conexión. No requiere servidor.

---

## 🗺 Flujo de trabajo recomendado

```
1️⃣ TRAMO        → Ingresa los datos de la unidad muestreada
2️⃣ REGISTRAR    → Documenta cada falla (tipo, severidad, medición, GPS, foto)
3️⃣ REGISTROS    → Revisa y filtra lo capturado
4️⃣ GALERÍA      → Visualiza y descarga todas las fotos
5️⃣ RESUMEN      → Estadísticas y exportación final
```

---

## 📷 Sistema de fotografías

- **Múltiples fotos por falla:** puedes capturar varias fotos para un mismo registro.
- **Cámara o galería:** usa la cámara del celular o carga fotos existentes.
- **Galería centralizada:** el panel "Galería" muestra todas las fotos con su falla, severidad y fecha.
- **Descarga individual o masiva:** descarga una foto o todas con nombre automático.

**Formato de nombre de archivo descargado:**
```
PCI_F01_SevA_2025-07-15_01.jpg
     │    │    │           └─ número de foto
     │    │    └─────────── fecha de inspección
     │    └──────────────── severidad (A/M/B)
     └───────────────────── número de falla
```

---

## 📌 Reglas PCI (ASTM D6433) implementadas

| Regla | Descripción |
|-------|-------------|
| **Fallas 9 y 14** | Se registran pero se **ignoran** en el cálculo del PCI |
| **Fallas 4 y 8** | Solo se registran si existe **losa de concreto** debajo |
| **Falla 11** | Si se registra, **bloquea** todas las demás fallas de la UM |
| **Falla 10 + 8** | Si existe falla 10, **no** se puede registrar falla 8 |
| **Fallas 1 y 15** | Se miden por separado para cada nivel de severidad |

---

## 💾 Almacenamiento de datos

Los datos se guardan automáticamente en el navegador (**localStorage**). No se pierden al cerrar la ventana, pero sí si borras el historial del navegador o usas modo incógnito.

**Recomendación:** Exporta CSV o JSON al terminar cada jornada de campo.

---

## 📤 Exportación

| Formato | Contenido |
|---------|-----------|
| **CSV** | Tabla con todos los registros, apta para Excel |
| **JSON** | Datos completos estructurados (para importar o procesar) |
| **Fotos** | Descarga individual o masiva de todas las fotografías |

---

## ⚙ Compatibilidad

- ✅ Android (Chrome, Samsung Internet)
- ✅ iOS (Safari, Chrome)
- ✅ Windows / macOS (Chrome, Firefox, Edge, Safari)
- ✅ Sin instalación · Sin internet requerido
- ✅ Pantallas desde 320 px hasta escritorio

---

## 📐 Cálculo PCI (gabinete)

El Inspector PCI captura todos los datos de campo necesarios. El cálculo final del **Índice de Condición del Pavimento** (`PCI = 100 − VDC`) se realiza en gabinete usando las curvas de deducción del estándar ASTM D6433-18 con los datos exportados en CSV o JSON.

---

*Universidad Nacional del Altiplano — Puno | Facultad de Ingeniería Civil y Arquitectura*
*Curso CIV333 — Pavimentos*