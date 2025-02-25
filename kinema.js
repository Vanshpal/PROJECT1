/**
 * kinema-body
 *
 * Based on kinematic-body, from AFrame Extras (slightly modified).
 * The physics engine computes collisions, and we manually apply them
 * so the entity cannot pass through solid objects.
 */
const EPS = 0.000001;

AFRAME.registerComponent('kinema-body', {
  dependencies: ['velocity'],

  schema: {
    mass:           { default: 5 },
    radius:         { default: 1.3 },
    linearDamping:  { default: 0.05 },
    enableSlopes:   { default: true },
    enableJumps:    { default: false },
  },

  init: function () {
    this.system = this.el.sceneEl.systems.physics;
    this.system.addComponent(this);

    const el = this.el;
    const data = this.data;
    const position = (new CANNON.Vec3()).copy(
      el.object3D.getWorldPosition(new THREE.Vector3())
    );

    // Create a physics body in Cannon.js
    this.body = new CANNON.Body({
      material: this.system.getMaterial('staticMaterial'),
      position: position,
      mass: data.mass,
      linearDamping: data.linearDamping,
      fixedRotation: true
    });

    // Use a sphere shape to approximate collision
    this.body.addShape(
      new CANNON.Sphere(data.radius),
      new CANNON.Vec3(0, data.radius, 0)
    );

    this.body.el = this.el;
    this.el.body = this.body;
    this.system.addBody(this.body);

    if (el.hasAttribute('wasd-controls')) {
      console.warn('[kinema-body] Not compatible with wasd-controls; use movement-controls.');
    }
  },

  remove: function () {
    this.system.removeBody(this.body);
    this.system.removeComponent(this);
    delete this.el.body;
  },

  beforeStep: function (t, dt) {
    if (!dt) return;
    const el = this.el;
    const body = this.body;

    // If enableJumps is off, zero out Y velocity
    if (!this.data.enableJumps) body.velocity.set(0, 0, 0);

    // Sync physics body to the A-Frame element’s current position
    body.position.copy(el.getAttribute('position'));
  },

  step: (function () {
    const velocity = new THREE.Vector3();
    const normalizedVelocity = new THREE.Vector3();
    const currentSurfaceNormal = new THREE.Vector3();
    const groundNormal = new THREE.Vector3();

    return function (t, dt) {
      if (!dt) return;

      let body = this.body;
      let data = this.data;
      let didCollide = false;
      let height;
      let groundHeight = -Infinity;
      let groundBody;
      let contacts = this.system.getContacts();

      dt = Math.min(dt, this.system.data.maxInterval * 1000);

      groundNormal.set(0, 0, 0);

      // Get the velocity from the A-Frame ‘velocity’ component
      velocity.copy(this.el.getAttribute('velocity'));

      // Start by copying that velocity into the physics body
      body.velocity.copy(velocity);

      // Check for collisions in the physics world
      for (let i = 0; i < contacts.length; i++) {
        let contact = contacts[i];
        if (!contact.enabled) { continue; }

        // Which side of the contact is us?
        if (body.id === contact.bi.id) {
          contact.ni.negate(currentSurfaceNormal);
        } else if (body.id === contact.bj.id) {
          currentSurfaceNormal.copy(contact.ni);
        } else {
          continue;
        }

        didCollide = body.velocity.dot(currentSurfaceNormal) < -EPS;

        // If we’re moving through an object, project velocity onto plane
        if (didCollide && currentSurfaceNormal.y <= 0.5) {
          velocity.projectOnPlane(currentSurfaceNormal);
        } else if (currentSurfaceNormal.y > 0.5) {
          // "Ground" detection logic
          height = (body.id === contact.bi.id)
            ? Math.abs(contact.rj.y + contact.bj.position.y)
            : Math.abs(contact.ri.y + contact.bi.position.y);
          if (height > groundHeight) {
            groundHeight = height;
            groundNormal.copy(currentSurfaceNormal);
            groundBody = (body.id === contact.bi.id) ? contact.bj : contact.bi;
          }
        }
      }

      normalizedVelocity.copy(velocity).normalize();

      // If standing on ground, project velocity onto that ground
      if (groundBody && (!data.enableJumps || normalizedVelocity.y < 0.5)) {
        if (!data.enableSlopes) {
          groundNormal.set(0, 1, 0);
        } else if (groundNormal.y < 1 - EPS) {
          groundNormal.copy(this.raycastToGround(groundBody, groundNormal));
        }
        velocity.projectOnPlane(groundNormal);
      } else if (this.system.driver.world) {
        // Otherwise, apply gravity if not on ground
        velocity.add(this.system.driver.world.gravity.scale(dt * 4.0 / 100));
      }

      // Store final velocity
      body.velocity.copy(velocity);

      // Sync back into A-Frame
      this.el.setAttribute('velocity', body.velocity);
      this.el.setAttribute('position', body.position);
    };
  }()),

  raycastToGround: function (groundBody, groundNormal) {
    let ray;
    let hitNormal;
    let vFrom = this.body.position;
    let vTo = this.body.position.clone();

    ray = new CANNON.Ray(vFrom, vTo);
    ray.intersectBody(groundBody);

    if (!ray.hasHit) return groundNormal;
    hitNormal = ray.result.hitNormalWorld;
    return (Math.abs(hitNormal.y) > Math.abs(groundNormal.y)) ? hitNormal : groundNormal;
  }
});
