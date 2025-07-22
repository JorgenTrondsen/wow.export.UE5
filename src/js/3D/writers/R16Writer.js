/*!
	wow.export (https://github.com/Kruithne/wow.export)
	Authors: Kruithne <kruithne@gmail.com>
	License: MIT
 */
const path = require('path');
const generics = require('../../generics');
const FileWriter = require('../../file-writer');

class R16Writer {
	/**
	 * Construct a new R16Writer instance.
	 */
	constructor() {
		this.out = null;
		this.column = 0;
		this.row = 0; 
		this.heightData = [];
		this.minHeight = Infinity;
		this.maxHeight = -Infinity;
	}

	/**
	 * Set height data from ADT chunk structure.
	 * Creates a heightmap that tries to match the OBJ topology exactly - clean quads with center vertices.
	 * This will be approximately 16x16 quads per chunk = ~16*16+1 = 257 vertices per side total.
	 * @param {Array} chunks Array of chunk data from ADT
	 */
	setHeightDataFromChunks(chunks) {
		// Create a heightmap that matches the OBJ vertex structure
		// Each tile contributes 16x16 chunks (17x17 vertices) but we need to be selective
		const chunksPerSide = 16; // 16x16 chunks per ADT
		
		// Use the same vertex arrangement as the OBJ export
		// We'll create a grid based on the actual vertex pattern from ADT chunks
		const vertsPerChunk = 17; // 17x17 logical grid per chunk
		const fullSize = chunksPerSide * (vertsPerChunk - 1) + 1; // 257x257
		
		const heights = new Array(fullSize * fullSize).fill(0);
		const heightSet = new Array(fullSize * fullSize).fill(false);

		// Process each chunk and extract vertices in the same pattern as OBJ export
		for (let chunkX = 0; chunkX < chunksPerSide; chunkX++) {
			for (let chunkY = 0; chunkY < chunksPerSide; chunkY++) {
				const chunkIndex = chunkX * chunksPerSide + chunkY;
				const chunk = chunks[chunkIndex];
				
				if (!chunk || !chunk.vertices) continue;

				const chunkVertices = chunk.vertices;
				const chunkPosition = chunk.position;
				
				// Process vertices in the same order as the original OBJ export logic
				let vertexIndex = 0;
				for (let row = 0; row < 17; row++) {
					const isShort = !!(row % 2);
					const colCount = isShort ? 8 : 9;
					
					for (let col = 0; col < colCount; col++) {
						if (vertexIndex >= chunkVertices.length) break;
						
						// Calculate position within chunk's 17x17 grid
						let localX, localY;
						
						if (isShort) {
							// Short rows: 8 vertices, offset by 0.5
							localX = col * 2 + 1;
							localY = row;
						} else {
							// Full rows: 9 vertices  
							localX = col * 2;
							localY = row;
						}
						
						// Map to global coordinates
						const globalX = chunkY * (vertsPerChunk - 1) + localX;
						const globalY = chunkX * (vertsPerChunk - 1) + localY;
						
						// Only set vertices that fit within our target grid and haven't been set
						if (globalX < fullSize && globalY < fullSize && 
							localX < vertsPerChunk && localY < vertsPerChunk) {
							
							const index = globalY * fullSize + globalX;
							if (!heightSet[index]) {
								const heightValue = chunkVertices[vertexIndex] + chunkPosition[2];
								heights[index] = heightValue;
								heightSet[index] = true;

								if (heightValue < this.minHeight) this.minHeight = heightValue;
								if (heightValue > this.maxHeight) this.maxHeight = heightValue;
							}
						}
						
						vertexIndex++;
					}
				}
			}
		}
		
		// Fill any missing vertices by interpolation from neighbors
		for (let y = 0; y < fullSize; y++) {
			for (let x = 0; x < fullSize; x++) {
				const index = y * fullSize + x;
				if (!heightSet[index]) {
					// Simple interpolation from available neighbors
					let totalHeight = 0;
					let count = 0;
					
					let neighbors;
					if (x % 2 === 0) {
						// (even, odd) - vertical interpolation
						neighbors = [{dx: 0, dy: -1}, {dx: 0, dy: 1}];
					} else {
						// (odd, even) - horizontal interpolation
						neighbors = [{dx: -1, dy: 0}, {dx: 1, dy: 0}];
					}
					
					for (const {dx, dy} of neighbors) {
						const nx = x + dx;
						const ny = y + dy;
						if (nx >= 0 && nx < fullSize && ny >= 0 && ny < fullSize) {
							const nIndex = ny * fullSize + nx;
							if (heightSet[nIndex]) {
								totalHeight += heights[nIndex];
								count++;
							}
						}
					}
					
					if (count > 0) {
						heights[index] = totalHeight / count;
						heightSet[index] = true;
					}
				}
			}
		}
		this.heightData = heights;
	}

	/**
	 * Write the R16 heightmap file.
	 * R16 format is a raw 16-bit unsigned integer heightmap.
	 * @param {boolean} overwrite Whether to overwrite existing files
	 */
	async write(overwrite = true) {
		// If overwriting is disabled, check file existence.
		if (!overwrite && await generics.fileExists(this.out))
			return;

		await generics.createDirectory(path.dirname(this.out));
		
		// Create FileWriter with binary encoding
		const writer = new FileWriter(this.out, 'binary');
		
		try {
			// Create buffer for R16 data (2 bytes per pixel)
			const fullSize = Math.sqrt(this.heightData.length);
			const buffer = Buffer.alloc(fullSize * fullSize * 2);
			
			// Write height data as 16-bit unsigned integers (little-endian)
			for (let i = 0; i < this.heightData.length; i++) {
				// Normalize height to 0-1 range.
				let normalizedHeight = (this.heightData[i] - this.minHeight) / (this.maxHeight - this.minHeight);

				// Convert to 16-bit unsigned integer (0-65535 range)
				const r16Value = Math.round(normalizedHeight * 65535);
				buffer.writeUInt16LE(r16Value, i * 2);
			}

			// Write the buffer using FileWriter's underlying stream
			await new Promise((resolve, reject) => {
				writer.stream.write(buffer, (error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		} finally {
			writer.close();
		}
	}
}

module.exports = R16Writer;
