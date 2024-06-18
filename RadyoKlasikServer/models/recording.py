from sqlalchemy import create_engine, Column, String, Integer, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///recordings.db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Recording(Base):
    __tablename__ = "recordings"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, unique=True, index=True)
    title = Column(String)
    artist = Column(String)
    album = Column(String)
    artwork = Column(String)
    duration = Column(Integer)
    size = Column(Float)

Base.metadata.create_all(bind=engine)
