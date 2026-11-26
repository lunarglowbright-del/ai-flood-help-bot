export type NearbyService = {
  category: string;
  name: string;
  type: string;
  province: string;
  area: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
};

type ServiceRow = Omit<NearbyService, "category" | "distanceKm">;

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && csv[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseCoordinate(value: string, minimum: number, maximum: number): number | null {
  const normalized = value.trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return null;
  }

  const coordinate = Number(normalized);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function categoryForType(type: string): string {
  const normalized = type.toLocaleLowerCase();
  if (normalized.includes("police") || normalized.includes("ตำรวจ")) {
    return "ตำรวจ";
  }
  if (normalized.includes("hospital") || normalized.includes("โรงพยาบาล")) {
    return "โรงพยาบาล";
  }
  if (normalized.includes("rescue") || normalized.includes("กู้ภัย")) {
    return "กู้ภัย/กู้ชีพ";
  }
  if (normalized.includes("disaster") || normalized.includes("ป้องกัน")) {
    return "ป้องกันและบรรเทาสาธารณภัย";
  }

  return type.trim() || "หน่วยงานอื่น";
}

function distanceInKm(
  latitude: number,
  longitude: number,
  otherLatitude: number,
  otherLongitude: number
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDifference = radians(otherLatitude - latitude);
  const longitudeDifference = radians(otherLongitude - longitude);
  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(otherLatitude)) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 6371.0088 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function findNearestServices(
  csv: string,
  latitude: number,
  longitude: number
): { services: NearbyService[]; skippedCoordinateRows: number } {
  const rows = parseCsv(csv);
  const headers = rows.shift()?.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim().toLocaleLowerCase()
  );
  if (!headers) {
    throw new Error("FAQ sheet is missing its header row");
  }

  const column = (header: string) => headers.indexOf(header);
  const nameColumn = column("service name");
  const typeColumn = column("type");
  const provinceColumn = column("province");
  const areaColumn = column("district/area");
  const addressColumn = column("address");
  const latitudeColumn = column("latitude");
  const longitudeColumn = column("longitude");
  const phoneColumn = column("phone number");

  if (nameColumn < 0 || typeColumn < 0 || latitudeColumn < 0 || longitudeColumn < 0) {
    throw new Error("FAQ sheet must include Service Name, Type, Latitude, and Longitude");
  }

  const services: NearbyService[] = [];
  let skippedCoordinateRows = 0;

  for (const row of rows) {
    const name = row[nameColumn]?.trim();
    if (!name) {
      continue;
    }

    const serviceLatitude = parseCoordinate(row[latitudeColumn] ?? "", -90, 90);
    const serviceLongitude = parseCoordinate(row[longitudeColumn] ?? "", -180, 180);
    if (serviceLatitude === null || serviceLongitude === null) {
      skippedCoordinateRows += 1;
      continue;
    }

    const service: ServiceRow = {
      name,
      type: row[typeColumn]?.trim() ?? "",
      province: provinceColumn >= 0 ? row[provinceColumn]?.trim() ?? "" : "",
      area: areaColumn >= 0 ? row[areaColumn]?.trim() ?? "" : "",
      address: addressColumn >= 0 ? row[addressColumn]?.trim() ?? "" : "",
      phone: phoneColumn >= 0 ? row[phoneColumn]?.trim() ?? "" : "",
      latitude: serviceLatitude,
      longitude: serviceLongitude
    };

    services.push({
      ...service,
      category: categoryForType(service.type),
      distanceKm: distanceInKm(latitude, longitude, serviceLatitude, serviceLongitude)
    });
  }

  const nearestByCategory = new Map<string, NearbyService>();
  for (const service of services) {
    const current = nearestByCategory.get(service.category);
    if (!current || service.distanceKm < current.distanceKm) {
      nearestByCategory.set(service.category, service);
    }
  }

  return {
    services: [...nearestByCategory.values()].sort((first, second) =>
      first.category.localeCompare(second.category, "th")
    ),
    skippedCoordinateRows
  };
}
