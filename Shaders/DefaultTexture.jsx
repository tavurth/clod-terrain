"use strict";

let uniforms = {
};

let vShader = `

int main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

`;

let fShader = `

int main() {
    gl_FragColor = vec4(1.0);
}

`;

export default function() {
    return new THREE.ShaderMaterial({
        depthWrite: false,
        transparent: true,
        uniforms: uniforms,
        vertexShader: vShader,
        fragmentShader: fShader,
    })
};
