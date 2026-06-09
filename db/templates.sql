CREATE TABLE templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '/src/images/blog/anna.avif',
    category VARCHAR(100),
    url VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Datos de prueba opcionales
INSERT INTO templates (name, description, category, url) VALUES 
('Real Estate', 'Modern property dealer website', 'Business', '/templates/real-estate'),
('Gym', 'Fitness & gym landing page', 'Fitness', '/templates/gym');