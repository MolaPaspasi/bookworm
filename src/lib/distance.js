// Calculate distance between two points using Haversine formula
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

// Sort packages by distance from customer location
export function sortPackagesByDistance(packages, customerLat, customerLon) {
  return packages.map(pkg => {
    if (pkg.company.location && pkg.company.location.coordinates) {
      const [companyLon, companyLat] = pkg.company.location.coordinates;
      const distance = calculateDistance(customerLat, customerLon, companyLat, companyLon);
      return {
        ...pkg.toObject(),
        distance: Math.round(distance * 100) / 100 // Round to 2 decimal places
      };
    }
    return {
      ...pkg.toObject(),
      distance: null // No location data
    };
  }).sort((a, b) => {
    // Packages with no location data go to the end
    if (a.distance === null && b.distance === null) return 0;
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    
    // Sort by distance (closest first)
    return a.distance - b.distance;
  });
}
