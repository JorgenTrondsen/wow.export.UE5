/*!
	wow.export (https://github.com/Kruithne/wow.export)
	Authors: Kruithne <kruithne@gmail.com>, Marlamin <marlamin@marlamin.com>
	License: MIT
 */
const log = require('../log');

class FaceCuller {
	/**
	 * Cull back-facing triangles for single-sided materials to ensure only one face per surface.
	 * Uses face normal calculation and geometric analysis to determine triangle orientation.
	 * @param {Array} triangleIndices Array of vertex indices forming triangles
	 * @param {Array} vertices Array of vertex coordinates [x, y, z, x, y, z, ...]
	 * @returns {Array} Filtered array with back-facing triangles removed
	 */
	static cullBackFaces(triangleIndices, vertices) {
		const culledIndices = [];
		const triangleMap = new Map(); // Track unique triangles to avoid duplicates

		// Validate input
		if (!triangleIndices || !vertices || triangleIndices.length === 0) {
			return triangleIndices || [];
		}

		// Process triangles in groups of 3 indices
		for (let i = 0; i < triangleIndices.length; i += 3) {
			const i0 = triangleIndices[i];
			const i1 = triangleIndices[i + 1];
			const i2 = triangleIndices[i + 2];

			// Validate vertex indices
			if (i0 * 3 + 2 >= vertices.length || i1 * 3 + 2 >= vertices.length || i2 * 3 + 2 >= vertices.length) {
				// Skip invalid triangles but keep them in output to avoid breaking geometry
				culledIndices.push(i0, i1, i2);
				continue;
			}

			// Create a unique key for this triangle (vertex order independent)
			const sortedIndices = [i0, i1, i2].sort((a, b) => a - b);
			const triangleKey = sortedIndices.join('-');

			// Get vertex positions (vertices are stored as [x, y, z, x, y, z, ...])
			const v0 = [vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]];
			const v1 = [vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]];
			const v2 = [vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]];

			// Calculate two edge vectors
			const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
			const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

			// Calculate face normal using cross product
			const normal = [
				edge1[1] * edge2[2] - edge1[2] * edge2[1],
				edge1[2] * edge2[0] - edge1[0] * edge2[2],
				edge1[0] * edge2[1] - edge1[1] * edge2[0]
			];

			// Calculate normal length for normalization
			const normalLength = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
			
			// Skip degenerate triangles
			if (normalLength < 1e-6) {
				continue;
			}

			// Normalize the normal
			normal[0] /= normalLength;
			normal[1] /= normalLength;
			normal[2] /= normalLength;

			// Check if we've already processed this triangle area
			if (triangleMap.has(triangleKey)) {
				const existingTriangle = triangleMap.get(triangleKey);
				
				// Calculate dot product between normals to determine if they're opposite
				const dotProduct = normal[0] * existingTriangle.normal[0] + 
				                   normal[1] * existingTriangle.normal[1] + 
				                   normal[2] * existingTriangle.normal[2];
				
				// If normals are nearly opposite (dot product close to -1), we have front/back faces
				if (dotProduct < -0.8) {
					// Keep the triangle with the "more forward-facing" normal
					// Priority: positive Z, then positive Y, then positive X
					const currentScore = normal[2] * 4 + normal[1] * 2 + normal[0];
					const existingScore = existingTriangle.normal[2] * 4 + existingTriangle.normal[1] * 2 + existingTriangle.normal[0];
					
					if (currentScore > existingScore) {
						// Replace the existing triangle with this one
						triangleMap.set(triangleKey, {
							indices: [i0, i1, i2],
							normal: normal
						});
					}
					// Otherwise keep the existing one (don't add current)
				} else {
					// Not opposite normals, might be co-planar or slightly different triangles
					// Keep both if they have significantly different normals
					culledIndices.push(i0, i1, i2);
				}
			} else {
				// First time seeing this triangle
				triangleMap.set(triangleKey, {
					indices: [i0, i1, i2],
					normal: normal
				});
			}
		}

		// Add all kept triangles from the map
		for (const triangle of triangleMap.values()) {
			culledIndices.push(...triangle.indices);
		}

		return culledIndices;
	}
}

module.exports = FaceCuller;
