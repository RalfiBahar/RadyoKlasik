from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

DATABASE_URL = "sqlite:///recordings.db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Recording(Base):
    __tablename__ = "recordings"

    id = Column(String, primary_key=True, index=True)
    filename = Column(String, unique=True, index=True)
    stream = Column(String, unique=True)
    title = Column(String)
    artist = Column(String)
    album = Column(String)
    artwork = Column(String)
    duration = Column(Integer)
    size = Column(Float)
    date = Column(DateTime, default=datetime.datetime.utcnow)
    play_count = Column(Integer, default=0)  



Base.metadata.create_all(bind=engine)
